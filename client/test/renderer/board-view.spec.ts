import { cell } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DRAWING_STYLE } from '@/lib/drawing-style';
import { ROUTE_BEND_DWELL_MS, settleRoute, startRoute, stepRoute } from '@/lib/token-route';
import { buildBoardView, imageUrlsOf } from '@/renderer/board-view';
import { boardSightOf } from '@/lib/board-sight';
import { CELL_WORLD_SIZE } from '@/renderer/camera';
import { PATH_ID, path, SQUARE_ID, square } from '../support/drawing-fixtures';
import { CORRIDOR_TORCH_ID, corridorTorch, veiledTorch } from '../support/light-fixtures';
import {
  ANA_AT_TABLE,
  KAEL_ID,
  LYRA_ID,
  VHARN_SCENE,
  activeCondition,
  kael,
  lyra,
  BIA_AT_TABLE,
  vharnBoard,
} from '../support/table-session-fixtures';

const NO_TOKENS = {
  tokens: [],
  selectedTokenIds: [],
  activeLayer: 'tokens',
  canChooseLayer: false,
  preview: [],
  facingPreview: {},
  resizePreview: {},
  drag: null,
  dragged: {},
  readOnly: false,
  tool: 'select',
  currentTokenIds: [],
  drawings: [],
  viewer: { userId: 'ana', isMaster: true },
  selectedDrawingIds: [],
  drawingPreview: [],
  drawingStyle: DEFAULT_DRAWING_STYLE,
} as const;

describe('buildBoardView', () => {
  it('carries the scene size in world px and the grid opacity as a fraction', () => {
    const view = buildBoardView({
      ...NO_TOKENS,
      scene: VHARN_SCENE,
      localGridVisible: true,
      ruler: null,
    });
    expect(view.sceneSize).toEqual({ width: 20 * CELL_WORLD_SIZE, height: 12 * CELL_WORLD_SIZE });
    expect(view.grid).toEqual({
      visible: true,
      opacity: 0.3,
      cells: { widthCells: 20, heightCells: 12 },
    });
    expect(view.ruler).toBeNull();
  });

  it.each([
    [true, false, false],
    [false, true, false],
    [true, true, true],
  ])('scene grid %s and local grid %s show the grid: %s', (scene, local, visible) => {
    const view = buildBoardView({
      ...NO_TOKENS,
      scene: { ...VHARN_SCENE, gridVisible: scene },
      localGridVisible: local,
      ruler: null,
    });
    expect(view.grid.visible).toBe(visible);
  });

  it('a ruler from (0,0) to (3,2) is 3 cells, with the label in the scene unit', () => {
    const view = buildBoardView({
      ...NO_TOKENS,
      scene: VHARN_SCENE,
      localGridVisible: true,
      ruler: { from: cell(0, 0), to: cell(3, 2) },
    });
    expect(view.ruler).toEqual({
      points: [
        { x: 32, y: 32 },
        { x: 3 * CELL_WORLD_SIZE + 32, y: 2 * CELL_WORLD_SIZE + 32 },
      ],
      steps: [],
      label: '3 casas · 4,5 m',
    });
  });

  describe('images and facing', () => {
    const PORTRAIT_ID = '4a3b2c1d-0e9f-4a8b-9c7d-6e5f4a3b2c1d';

    function viewWith(scene = VHARN_SCENE, tokens = [lyra()]) {
      return buildBoardView({ ...NO_TOKENS, tokens, scene, localGridVisible: true, ruler: null });
    }

    it('a token with an image carries its url, frame and flips, and its facing', () => {
      const token = lyra({ imageAssetId: PORTRAIT_ID, frame: 'round', flipX: true, facing: 90 });

      expect(viewWith(VHARN_SCENE, [token]).tokens[0]).toMatchObject({
        art: { url: `/api/assets/${PORTRAIT_ID}`, frame: 'round', flipX: true, flipY: false },
        facing: 90,
      });
    });

    it('a defeated token carries the mark, a living one does not', () => {
      const tokens = [lyra({ defeated: true }), kael()];

      expect(viewWith(VHARN_SCENE, tokens).tokens.map(({ defeated }) => defeated)).toEqual([
        true,
        false,
      ]);
    });

    it('only a token on the tokens layer carries the facing mark; objects and background turn without it', () => {
      const tokens = [
        lyra(),
        kael({ id: 'chest', layer: 'objects' }),
        kael({ id: 'map', layer: 'background' }),
      ];
      const marks = viewWith(VHARN_SCENE, tokens).tokens.map(({ id, facingMark }) => [
        id,
        facingMark,
      ]);
      expect(Object.fromEntries(marks)).toEqual({ [LYRA_ID]: true, chest: false, map: false });
    });

    it('a token without an image keeps the initials disc (no art)', () => {
      expect(viewWith().tokens[0]?.art).toBeNull();
    });

    it('a token another viewer cannot control shows the same image (not a secret)', () => {
      const token = lyra({ imageAssetId: PORTRAIT_ID, canControl: false, bars: [] });

      expect(viewWith(VHARN_SCENE, [token]).tokens[0]?.art?.url).toBe(`/api/assets/${PORTRAIT_ID}`);
    });

    it('a scene with a background stretches it over the cells in world px', () => {
      const scene = {
        ...VHARN_SCENE,
        widthCells: 30,
        heightCells: 10,
        background: { assetId: PORTRAIT_ID, width: 1400, height: 700 },
      };

      expect(viewWith(scene).background).toEqual({
        url: `/api/assets/${PORTRAIT_ID}`,
        width: 30 * CELL_WORLD_SIZE,
        height: 10 * CELL_WORLD_SIZE,
      });
    });

    it('a scene without a background has none', () => {
      expect(viewWith().background).toBeNull();
    });

    it('the image urls of a view are the background and each token art, once each', () => {
      const scene = { ...VHARN_SCENE, background: { assetId: KAEL_ID, width: 10, height: 10 } };
      const tokens = [lyra({ imageAssetId: PORTRAIT_ID }), kael({ imageAssetId: PORTRAIT_ID })];

      expect([...imageUrlsOf(viewWith(scene, tokens))]).toEqual([
        `/api/assets/${KAEL_ID}`,
        `/api/assets/${PORTRAIT_ID}`,
      ]);
    });

    it('the image of a condition shown on a token is among the image urls', () => {
      const tokens = [lyra({ conditions: [activeCondition({ imageAssetId: PORTRAIT_ID })] })];

      expect([...imageUrlsOf(viewWith(VHARN_SCENE, tokens))]).toEqual([
        `/api/assets/${PORTRAIT_ID}`,
      ]);
    });

    it('two tokens with the same condition image bring its url once', () => {
      const poisoned = [activeCondition({ imageAssetId: PORTRAIT_ID })];
      const tokens = [lyra({ conditions: poisoned }), kael({ conditions: poisoned })];

      expect([...imageUrlsOf(viewWith(VHARN_SCENE, tokens))]).toEqual([
        `/api/assets/${PORTRAIT_ID}`,
      ]);
    });

    it('a condition without an image adds no url', () => {
      const tokens = [lyra({ conditions: [activeCondition({ imageAssetId: null })] })];

      expect([...imageUrlsOf(viewWith(VHARN_SCENE, tokens))]).toEqual([]);
    });
  });

  describe('tokens', () => {
    function viewOf(overrides: Partial<Parameters<typeof buildBoardView>[0]> = {}) {
      return buildBoardView({
        ...NO_TOKENS,
        scene: VHARN_SCENE,
        localGridVisible: true,
        ruler: null,
        tokens: [lyra()],
        ...overrides,
      });
    }

    it('the selected token is marked', () => {
      expect(viewOf({ selectedTokenIds: [LYRA_ID] }).tokens[0]?.selected).toBe(true);
    });

    it('the preview shows a ghost at the cell asked for', () => {
      const view = viewOf({ preview: [{ tokenId: LYRA_ID, col: 8, row: 6 }] });
      expect(view.ghosts).toEqual([{ tokenId: LYRA_ID, col: 8, row: 6, width: 1, height: 1 }]);
    });
  });

  describe('layers', () => {
    function viewOf(overrides: Partial<Parameters<typeof buildBoardView>[0]> = {}) {
      return buildBoardView({
        ...NO_TOKENS,
        scene: VHARN_SCENE,
        localGridVisible: true,
        ruler: null,
        ...overrides,
      });
    }

    it('the layer menu is offered only to whoever may choose the layer (the master)', () => {
      expect(viewOf({ canChooseLayer: true }).layerMenu).toBe(true);
      expect(viewOf({ canChooseLayer: false }).layerMenu).toBe(false);
    });
  });

  describe('a token being dragged', () => {
    function viewOf(overrides: Partial<Parameters<typeof buildBoardView>[0]> = {}) {
      return buildBoardView({
        ...NO_TOKENS,
        scene: VHARN_SCENE,
        localGridVisible: true,
        ruler: null,
        tokens: [lyra()],
        ...overrides,
      });
    }

    // Lyra starts at (3, 4); she stands 2 s on (6, 4) and goes on to (6, 1).
    function bentRoute() {
      const toCorner = stepRoute(startRoute(cell(3, 4), 0), cell(6, 4), 0);
      return stepRoute(settleRoute(toCorner, ROUTE_BEND_DWELL_MS), cell(6, 1), 2100);
    }

    function centerOf(col: number, row: number, size = 1) {
      const half = (size * CELL_WORLD_SIZE) / 2;
      return { x: col * CELL_WORLD_SIZE + half, y: row * CELL_WORLD_SIZE + half };
    }

    function dragOf(route = bentRoute(), landing = [{ tokenId: LYRA_ID, col: 6, row: 1 }]) {
      return { anchorId: LYRA_ID, route, landing };
    }

    it('the ghost marks the cell the token is over, not only where it was dropped', () => {
      expect(viewOf({ drag: dragOf() }).ghosts).toEqual([
        { tokenId: LYRA_ID, col: 6, row: 1, width: 1, height: 1 },
      ]);
    });

    it('a group drag draws a ghost where each member would land', () => {
      const landing = [
        { tokenId: LYRA_ID, col: 6, row: 1 },
        { tokenId: KAEL_ID, col: 8, row: 1 },
      ];
      const tokens = [lyra(), kael({ width: 2, height: 1.5 })];
      expect(viewOf({ tokens, drag: dragOf(bentRoute(), landing) }).ghosts).toEqual([
        { tokenId: LYRA_ID, col: 6, row: 1, width: 1, height: 1 },
        { tokenId: KAEL_ID, col: 8, row: 1, width: 2, height: 1.5 },
      ]);
    });

    it('a group drag that would push a member off the scene draws no ghost', () => {
      const drag = { anchorId: LYRA_ID, route: bentRoute(), landing: null };
      expect(viewOf({ drag }).ghosts).toEqual([]);
    });

    it('the ruler runs from the start through each bend to the token, summing the legs', () => {
      const ruler = viewOf({ drag: dragOf() }).ruler;
      expect(ruler?.points).toEqual([centerOf(3, 4), centerOf(6, 4), centerOf(6, 1)]);
      expect(ruler?.label).toBe('6 casas · 9 m');
    });

    it('the trail of a drag marks the center of every cell it passes, bend included', () => {
      const cells = [
        [3, 4],
        [4, 4],
        [5, 4],
        [6, 4],
        [6, 3],
        [6, 2],
        [6, 1],
      ] as const;
      const steps = cells.map(([col, row]) => centerOf(col, row));
      expect(viewOf({ drag: dragOf() }).ruler?.steps).toEqual(steps);
    });

    it('a diagonal drag trails one diagonal cell at a time, as many as the label counts', () => {
      const route = stepRoute(startRoute(cell(3, 4), 0), cell(6, 3), 0);
      const ruler = viewOf({ drag: dragOf(route) }).ruler;
      const steps = [centerOf(3, 4), centerOf(4, 4), centerOf(5, 3), centerOf(6, 3)];
      expect([ruler?.steps, ruler?.label]).toEqual([steps, '3 casas · 4,5 m']);
    });

    it('the trail of a 2×2 token runs through the middle of its footprint', () => {
      const route = stepRoute(startRoute(cell(3, 4), 0), cell(5, 4), 0);
      const view = viewOf({ tokens: [lyra({ width: 2, height: 2 })], drag: dragOf(route) });
      const steps = [centerOf(3, 4, 2), centerOf(4, 4, 2), centerOf(5, 4, 2)];
      expect(view.ruler?.steps).toEqual(steps);
    });

    it('the ruler of a 2×2 token runs through the middle of its footprint', () => {
      const route = stepRoute(startRoute(cell(3, 4), 0), cell(5, 4), 0);
      const view = viewOf({ tokens: [lyra({ width: 2, height: 2 })], drag: dragOf(route) });
      expect(view.ruler?.points).toEqual([centerOf(3, 4, 2), centerOf(5, 4, 2)]);
    });

    it('the ruler of a 3×1 token runs through the middle of each side on its own', () => {
      const route = stepRoute(startRoute(cell(3, 4), 0), cell(5, 4), 0);
      const view = viewOf({ tokens: [lyra({ width: 3, height: 1 })], drag: dragOf(route) });
      const C = 64;
      expect(view.ruler?.points).toEqual([
        { x: 4.5 * C, y: 4.5 * C },
        { x: 6.5 * C, y: 4.5 * C },
      ]);
    });

    it('the drag wins over a ruler left by the tool', () => {
      const view = viewOf({ drag: dragOf(), ruler: { from: cell(0, 0), to: cell(1, 0) } });
      expect(view.ruler?.label).toBe('6 casas · 9 m');
    });

    it('someone else dragging Lyra draws her on that cell, ruler and ghost aside', () => {
      const view = viewOf({ dragged: { [LYRA_ID]: cell(7, 2) } });
      expect(view.tokens[0]).toMatchObject({ col: 7, row: 2 });
      expect(view.ghosts).toEqual([]);
      expect(view.ruler).toBeNull();
    });
  });

  describe('combat', () => {
    function viewWith(overrides: Partial<Parameters<typeof buildBoardView>[0]>) {
      return buildBoardView({
        ...NO_TOKENS,
        scene: VHARN_SCENE,
        localGridVisible: true,
        ruler: null,
        tokens: [lyra()],
        ...overrides,
      });
    }

    it('the token on turn gets the gold ring, and without combat nobody does', () => {
      expect(viewWith({ currentTokenIds: [LYRA_ID] }).tokens[0]?.onTurn).toBe(true);
      expect(viewWith({}).tokens[0]?.onTurn).toBe(false);
    });

    it('the conditions of a token reach the view, the harm before the benefit', () => {
      const conditions = [
        activeCondition({ id: 'a', tone: 'benefit' }),
        activeCondition({ id: 'b' }),
      ];
      const token = viewWith({ tokens: [lyra({ conditions })] }).tokens[0];
      expect(token?.conditions.map(({ tone }) => tone)).toEqual(['harm', 'benefit']);
    });
  });
});

describe('buildBoardView, drawings', () => {
  function viewWith(overrides: Partial<Parameters<typeof buildBoardView>[0]>) {
    return buildBoardView({
      ...NO_TOKENS,
      scene: VHARN_SCENE,
      localGridVisible: true,
      ruler: null,
      ...overrides,
    });
  }

  const PICKING = { tool: 'draw', drawMode: 'select' } as const;

  it('drawings are pickable only with the draw tool in Selecionar, whatever the active layer', () => {
    const drawings = [square(), path()];
    const pickableWith = (overrides: Partial<Parameters<typeof buildBoardView>[0]>) =>
      viewWith({ drawings, ...overrides }).drawings.map(({ id, pickable }) => [id, pickable]);

    expect(pickableWith({ ...PICKING, activeLayer: 'objects' })).toEqual([
      [SQUARE_ID, true],
      [PATH_ID, true],
    ]);
    expect(pickableWith({ tool: 'select' })).toEqual([
      [SQUARE_ID, false],
      [PATH_ID, false],
    ]);
    expect(pickableWith({ tool: 'draw', drawMode: 'draw' })).toEqual([
      [SQUARE_ID, false],
      [PATH_ID, false],
    ]);
  });

  it('the draw mode goes to the view, Desenhar when absent', () => {
    expect(viewWith({ ...PICKING }).drawMode).toBe('select');
    expect(viewWith({ tool: 'draw' }).drawMode).toBe('draw');
  });

  it('nothing is pickable while reconnecting', () => {
    const view = viewWith({ ...PICKING, drawings: [path()], readOnly: true });

    expect(view.drawings[0]?.pickable).toBe(false);
  });

  it('the sketch style shows only with the draw tool', () => {
    expect(viewWith({ tool: 'draw' }).sketch).toEqual(DEFAULT_DRAWING_STYLE);
    expect(viewWith({ tool: 'select' }).sketch).toBeNull();
  });
});

describe('buildBoardView wall mode', () => {
  const wallsInput = (more: object) => ({
    ...NO_TOKENS,
    scene: VHARN_SCENE,
    localGridVisible: true,
    ruler: null,
    tool: 'walls' as const,
    ...more,
  });

  it('erasing an area, the sketch is a thin ember box, never straight', () => {
    const view = buildBoardView(wallsInput({ wallMode: 'eraseArea' }));

    expect(view.sketch).toEqual({
      kind: 'rectangle',
      stroke: 'ember',
      fill: null,
      strokeWidth: 'thin',
    });
    expect(view.sketchStraight).toBe(false);
  });

  it('carries the action of the walls tool, Desenhar when absent', () => {
    expect(buildBoardView(wallsInput({})).wallMode).toBe('draw');
    expect(buildBoardView(wallsInput({ wallMode: 'eraseSegment' })).wallMode).toBe('eraseSegment');
  });
});

describe('buildBoardView, map lights', () => {
  const lightsInput = (more: object) => ({
    ...NO_TOKENS,
    scene: VHARN_SCENE,
    localGridVisible: true,
    ruler: null,
    lights: [corridorTorch()],
    ...more,
  });

  it('the master with the lights tool gets the torch full, selected and with its areas', () => {
    const view = buildBoardView(
      lightsInput({ tool: 'lights', selectedLightIds: [CORRIDOR_TORCH_ID] }),
    );

    expect(view.lights).toEqual([
      expect.objectContaining({ id: CORRIDOR_TORCH_ID, emphasis: 'full', selected: true }),
    ]);
    expect(view.lights[0]?.areas).not.toBeNull();
  });

  it('the master with another tool gets the torch faint and without areas', () => {
    const view = buildBoardView(lightsInput({ tool: 'select' }));

    expect(view.lights).toEqual([
      expect.objectContaining({ emphasis: 'faint', selected: false, areas: null }),
    ]);
  });

  it('a player gets no light drawn', () => {
    const view = buildBoardView(
      lightsInput({ tool: 'select', viewer: { userId: BIA_AT_TABLE.userId, isMaster: false } }),
    );

    expect(view.lights).toEqual([]);
  });
});

describe('buildBoardView, light tint', () => {
  const tintInput = (more: object) => ({
    ...NO_TOKENS,
    scene: { ...VHARN_SCENE, vision: 'dark' as const },
    localGridVisible: true,
    ruler: null,
    lights: [corridorTorch({ color: 'infernal' })],
    ...more,
  });

  it('Ana (the master, without fog) gets the infernal tint', () => {
    const view = buildBoardView(tintInput({}));

    expect(view.lightTint?.tints.map(({ color }) => color)).toEqual([0xff3b3b]);
  });

  it('Bia (a player, under her fog) gets the same tint', () => {
    const viewer = { userId: BIA_AT_TABLE.userId, isMaster: false };
    const view = buildBoardView(tintInput({ viewer }));

    expect(view.lightTint?.tints.map(({ color }) => color)).toEqual([0xff3b3b]);
  });

  it('without a colored light there is no tint', () => {
    expect(buildBoardView(tintInput({ lights: [corridorTorch()] })).lightTint).toBeNull();
  });
});

describe('buildBoardView while a lit token is dragged', () => {
  // Bia in the dark; Lyra (hers) at (3, 4) and Bram (Caio's, Kael's id) at (5, 4) each carry a
  // lit infernal torch of 2 + 2 cells.
  const torch = {
    light: { bright: 2, dim: 2, color: 'infernal' as const, angle: 360 },
    lightLit: true,
  };
  const bramAt = (col: number) =>
    kael({ canControl: false, controllerIds: [], col, row: 4, ...torch });
  const lyraAt = (col: number) => lyra({ sight: null, col, ...torch });

  function biaInput(tokens: ReturnType<typeof kael>[], more: object = {}) {
    const board = vharnBoard({
      viewer: { userId: BIA_AT_TABLE.userId, role: 'player' },
      scene: { ...VHARN_SCENE, vision: 'dark' },
      tokens,
    });
    return {
      ...NO_TOKENS,
      tokens,
      viewer: { userId: BIA_AT_TABLE.userId, isMaster: false },
      scene: board.scene,
      localGridVisible: true,
      ruler: null,
      sight: boardSightOf(board, { previewEyeIds: null }),
      ...more,
    };
  }

  it('Bram dragged by Caio to (8, 4) tints and lights from there, not from his confirmed cell', () => {
    const dragged = buildBoardView(
      biaInput([lyraAt(3), bramAt(5)], { dragged: { [KAEL_ID]: { col: 8, row: 4 } } }),
    );
    const there = buildBoardView(biaInput([lyraAt(3), bramAt(8)]));

    expect(dragged.lightTint?.tints[1]).toEqual(there.lightTint?.tints[1]);
    expect(dragged.fog?.lit).toEqual(there.fog?.lit);
  });

  it('Lyra dropped at (6, 4) and waiting for the server looks and lights from (6, 4)', () => {
    const preview = [{ tokenId: LYRA_ID, col: 6, row: 4 }];
    const waiting = buildBoardView(biaInput([lyraAt(3), bramAt(5)], { preview }));
    const there = buildBoardView(biaInput([lyraAt(6), bramAt(5)]));

    expect(waiting.fog?.holes).toEqual(there.fog?.holes);
    expect(waiting.fog?.lit).toEqual(there.fog?.lit);
  });

  it('with nothing dragged nor waiting the light shines from the confirmed cell', () => {
    const still = buildBoardView(biaInput([lyraAt(3), bramAt(5)]));
    const center = (5 + 0.5) * CELL_WORLD_SIZE;

    expect(still.fog?.lit.bright[1]?.some(({ x }) => x > center)).toBe(true);
    expect(still.fog?.lit.bright[1]?.every(({ x }) => x < center + 3 * CELL_WORLD_SIZE)).toBe(true);
  });

  it('the fog key changes when Bram reaches another cell and stays when he is back on the same one', () => {
    const over = (col: number) =>
      buildBoardView(biaInput([lyraAt(3), bramAt(5)], { dragged: { [KAEL_ID]: { col, row: 4 } } }))
        .fog?.key;

    const atEight = over(8);
    const atNine = over(9);

    expect(atNine).not.toBe(atEight);
    expect(over(8)).toBe(atEight);
  });
});

describe('buildBoardView while Lyra turns', () => {
  // Bia in the dark; Lyra (hers) at (3, 4) looks right in a field of 90° with darkvision 3 and
  // carries a fire lantern of 60°.
  const NARROW = lyra({
    sight: { bright: 3, dim: 0 },
    sightAngle: 90,
    light: { bright: 2, dim: 0, color: 'fire', angle: 60 },
    lightLit: true,
  });

  function biaInput(facingPreview: Record<string, number>) {
    const board = vharnBoard({
      viewer: { userId: BIA_AT_TABLE.userId, role: 'player' },
      scene: { ...VHARN_SCENE, vision: 'dark' },
      tokens: [NARROW],
    });
    return {
      ...NO_TOKENS,
      tokens: [NARROW],
      viewer: { userId: BIA_AT_TABLE.userId, isMaster: false },
      scene: board.scene,
      localGridVisible: true,
      ruler: null,
      sight: boardSightOf(board, { previewEyeIds: null }),
      facingPreview,
    };
  }

  it('the facing preview turns the fog and the tint of her lantern before the ack', () => {
    const still = buildBoardView(biaInput({}));
    const turning = buildBoardView(biaInput({ [LYRA_ID]: 180 }));

    expect(turning.fog?.key).not.toBe(still.fog?.key);
    expect(turning.fog?.dim).not.toEqual(still.fog?.dim);
    expect(turning.lightTint?.key).not.toBe(still.lightTint?.key);
  });
});

describe('buildBoardView while the master aims a spotlight', () => {
  // Ana with the lights tool; the infernal spotlight at (5, 5) looks right (0) and opens 60°.
  const SPOTLIGHT = corridorTorch({ color: 'infernal', facing: 0, angle: 60 });

  function anaInput(lightAimPreview: Record<string, number>) {
    return {
      ...NO_TOKENS,
      tokens: [],
      viewer: { userId: ANA_AT_TABLE.userId, isMaster: true },
      scene: { ...VHARN_SCENE, vision: 'dark' as const },
      localGridVisible: true,
      ruler: null,
      tool: 'lights' as const,
      lights: [SPOTLIGHT],
      lightAimPreview,
    };
  }

  it('the areas of the tool and the tint follow the handle before it is released', () => {
    const still = buildBoardView(anaInput({}));
    const aimed = buildBoardView(anaInput({ [CORRIDOR_TORCH_ID]: 180 }));
    const there = buildBoardView({ ...anaInput({}), lights: [{ ...SPOTLIGHT, facing: 180 }] });

    expect(aimed.lights[0]?.areas).toEqual(there.lights[0]?.areas);
    expect(aimed.lights[0]?.areas).not.toEqual(still.lights[0]?.areas);
    expect(aimed.lightTint?.key).toBe(there.lightTint?.key);
  });
});

describe('buildBoardView, the outline of the field of view', () => {
  const NARROW = lyra({ col: 5, row: 5, sightAngle: 90 });

  function viewFor(isMaster: boolean) {
    const userId = isMaster ? ANA_AT_TABLE.userId : BIA_AT_TABLE.userId;
    return buildBoardView({
      ...NO_TOKENS,
      tokens: [NARROW],
      viewer: { userId, isMaster },
      scene: { ...VHARN_SCENE, vision: 'dark' },
      localGridVisible: true,
      ruler: null,
      selectedTokenIds: [LYRA_ID],
    });
  }

  it('Ana with the narrow Lyra selected gets the outline, and Bia does not', () => {
    expect(viewFor(true).sightCone?.outline.length).toBeGreaterThan(3);
    expect(viewFor(false).sightCone).toBeNull();
  });
});

describe('buildBoardView, veiled lights', () => {
  // Bia in the dark with Lyra (hers, no light, no darkvision); a hidden wolf she never receives
  // carries an infernal torch of 2 + 0 cells shining from (8, 4.5).
  const WOLF_TORCH = veiledTorch({ x: 8, y: 4.5, bright: 2, dim: 0, color: 'infernal' });

  function biaWith(veiledLights: ReturnType<typeof veiledTorch>[]) {
    const tokens = [lyra()];
    const board = vharnBoard({
      viewer: { userId: BIA_AT_TABLE.userId, role: 'player' },
      scene: { ...VHARN_SCENE, vision: 'dark' },
      tokens,
      veiledLights,
    });
    return buildBoardView({
      ...NO_TOKENS,
      tokens,
      viewer: { userId: BIA_AT_TABLE.userId, isMaster: false },
      scene: board.scene,
      localGridVisible: true,
      ruler: null,
      sight: boardSightOf(board, { previewEyeIds: null }),
      veiledLights,
    });
  }

  it('the hidden wolf’s torch opens Bia’s fog and tints, and no token of it is drawn', () => {
    const view = biaWith([WOLF_TORCH]);

    expect(view.fog?.lit.bright).toHaveLength(1);
    expect(view.lightTint?.tints.map(({ color }) => color)).toEqual([0xff3b3b]);
    expect(view.tokens.map(({ id }) => id)).toEqual([LYRA_ID]);
  });

  it('without veiled lights the dark stays dark', () => {
    const view = biaWith([]);

    expect(view.fog?.lit.bright).toEqual([]);
    expect(view.lightTint).toBeNull();
  });
});
