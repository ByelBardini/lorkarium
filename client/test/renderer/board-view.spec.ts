import { cell } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DRAWING_STYLE } from '@/lib/drawing-style';
import { ROUTE_BEND_DWELL_MS, settleRoute, startRoute, stepRoute } from '@/lib/token-route';
import { buildBoardView, imageUrlsOf } from '@/renderer/board-view';
import { boardSightOf } from '@/lib/board-sight';
import { CELL_WORLD_SIZE } from '@/renderer/camera';
import { PATH_ID, path, SQUARE_ID, square } from '../support/drawing-fixtures';
import {
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
  currentTokenId: null,
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

    it('a token is a disc with its initials, its side ring, its cell, its sides and its name', () => {
      expect(viewOf().tokens[0]).toMatchObject({
        id: LYRA_ID,
        name: 'Lyra',
        initials: 'LY',
        ring: 'ally',
        col: 3,
        row: 4,
        width: 1,
        height: 1,
        selected: false,
        draggable: true,
      });
    });

    it('the bar at position 0 is drawn under the token, filled by its value', () => {
      expect(viewOf().tokens[0]?.bar).toEqual({
        fraction: 32 / 45,
        state: 'normal',
        color: 'ember',
      });
    });

    it('without the bar at position 0 (hidden), the token has no bar even with position 1', () => {
      const redacted = lyra({ canControl: false, bars: lyra().bars.slice(1) });
      expect(viewOf({ tokens: [redacted] }).tokens[0]?.bar).toBeNull();
    });

    it('a negative first bar is drawn as negative', () => {
      const [pv, inspiration] = lyra().bars;
      if (!pv || !inspiration) throw new Error('lyra() lost its bars');
      const hurt = lyra({ bars: [{ ...pv, current: -4 }, inspiration] });
      expect(viewOf({ tokens: [hurt] }).tokens[0]?.bar?.state).toBe('negative');
    });

    it('the selected token is marked', () => {
      expect(viewOf({ selectedTokenIds: [LYRA_ID] }).tokens[0]?.selected).toBe(true);
    });

    it('every token of a selection of two is marked', () => {
      const view = viewOf({ tokens: [lyra(), kael()], selectedTokenIds: [LYRA_ID, KAEL_ID] });
      expect(view.tokens.map(({ selected }) => selected)).toEqual([true, true]);
    });

    it('a resize of this viewer draws the token with its new box already', () => {
      const box = { col: 2, row: 4, width: 2, height: 1.5 };
      const view = viewOf({ resizePreview: { [LYRA_ID]: box } });
      expect(view.tokens[0]).toMatchObject(box);
    });

    it('the preview shows a ghost at the cell asked for', () => {
      const view = viewOf({ preview: [{ tokenId: LYRA_ID, col: 8, row: 6 }] });
      expect(view.ghosts).toEqual([{ tokenId: LYRA_ID, col: 8, row: 6, width: 1, height: 1 }]);
    });

    it('a token the viewer cannot control, or any token while read only, is not draggable', () => {
      expect(viewOf({ tokens: [lyra({ canControl: false })] }).tokens[0]?.draggable).toBe(false);
      expect(viewOf({ readOnly: true }).tokens[0]?.draggable).toBe(false);
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

    it('a chest on objects with the tokens layer active is neither pickable nor draggable', () => {
      const chest = kael({ layer: 'objects' });
      expect(viewOf({ tokens: [chest] }).tokens[0]).toMatchObject({
        layer: 'objects',
        pickable: false,
        draggable: false,
      });
    });

    it('with the objects layer active the chest is pickable and Lyra is not', () => {
      const view = viewOf({ tokens: [lyra(), kael({ layer: 'objects' })], activeLayer: 'objects' });
      expect(view.tokens.map(({ id, pickable }) => [id, pickable])).toEqual([
        [KAEL_ID, true],
        [LYRA_ID, false],
      ]);
    });

    it('the layer menu is offered only to whoever may choose the layer (the master)', () => {
      expect(viewOf({ canChooseLayer: true }).layerMenu).toBe(true);
      expect(viewOf({ canChooseLayer: false }).layerMenu).toBe(false);
    });

    it('tokens are drawn background first, then objects, then tokens, in list order inside each', () => {
      const map = kael({ id: 'map', layer: 'background' });
      const chest = kael({ id: 'chest', layer: 'objects' });
      const view = viewOf({ tokens: [lyra(), chest, kael(), map] });
      expect(view.tokens.map(({ id }) => id)).toEqual(['map', 'chest', LYRA_ID, KAEL_ID]);
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
      expect(viewOf({ drag: dragOf() }).ruler).toEqual({
        points: [centerOf(3, 4), centerOf(6, 4), centerOf(6, 1)],
        label: '6 casas · 9 m',
      });
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
      expect(viewWith({ currentTokenId: LYRA_ID }).tokens[0]?.onTurn).toBe(true);
      expect(viewWith({}).tokens[0]?.onTurn).toBe(false);
    });

    it('up to 3 condition icons in their tone, and the count of the rest', () => {
      const icons = ['skull', 'sparkles', 'lock', 'zap', 'moon'] as const;
      const tones = ['harm', 'benefit', 'harm', 'harm', 'benefit'] as const;
      const conditions = icons.map((icon, index) =>
        activeCondition({ id: `c-${index}`, icon, tone: tones[index] }),
      );
      const token = viewWith({ tokens: [lyra({ conditions })] }).tokens[0];
      expect(token?.marks).toEqual([
        { icon: 'skull', tone: 'harm' },
        { icon: 'sparkles', tone: 'benefit' },
        { icon: 'lock', tone: 'harm' },
      ]);
      expect(token?.moreMarks).toBe(2);
    });

    it('a token with two conditions has two marks and nothing past them', () => {
      const conditions = [
        activeCondition({ id: 'a' }),
        activeCondition({ id: 'b', tone: 'benefit' }),
      ];
      const token = viewWith({ tokens: [lyra({ conditions })] }).tokens[0];
      expect(token?.marks.map(({ tone }) => tone)).toEqual(['harm', 'benefit']);
      expect(token?.moreMarks).toBe(0);
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

  it('puts each drawing on its layer, pickable by the master on the active one', () => {
    const view = viewWith({ drawings: [square({ layer: 'objects' }), path()] });

    expect(view.drawings.map(({ id, layer, pickable }) => [id, layer, pickable])).toEqual([
      [SQUARE_ID, 'objects', false],
      [PATH_ID, 'tokens', true],
    ]);
  });

  it('nothing is pickable while reconnecting', () => {
    expect(viewWith({ drawings: [path()], readOnly: true }).drawings[0]?.pickable).toBe(false);
  });

  it('the sketch style shows only with the draw tool', () => {
    expect(viewWith({ tool: 'draw' }).sketch).toEqual(DEFAULT_DRAWING_STYLE);
    expect(viewWith({ tool: 'select' }).sketch).toBeNull();
  });
});

describe('buildBoardView through the sight of Bia in the dark', () => {
  // Lyra (hers) at (3, 4) sees 3 + 3 cells: Kael at (8, 4) is 5 away (silhouette), the goblin at
  // (11, 4) 8 away (hidden).
  const GOBLIN_ID = 'cc33dd44-ee55-4f66-8a77-112233445566';
  const others = { canControl: false, controllerIds: [] };
  const tokens = [
    lyra({ sight: { bright: 3, dim: 3 } }),
    kael({ ...others, col: 8, row: 4, conditions: [activeCondition()] }),
    kael({ ...others, id: GOBLIN_ID, col: 11, row: 4 }),
  ];
  const board = vharnBoard({
    viewer: { userId: BIA_AT_TABLE.userId, role: 'player' },
    scene: { ...VHARN_SCENE, vision: 'dark' },
    tokens,
  });
  const view = buildBoardView({
    ...NO_TOKENS,
    tokens,
    viewer: { userId: BIA_AT_TABLE.userId, isMaster: false },
    scene: board.scene,
    localGridVisible: true,
    ruler: null,
    currentTokenId: KAEL_ID,
    sight: boardSightOf(board, { previewEyeIds: null }),
  });

  it('the token in the penumbra is a silhouette with no art, name, bar, marks nor facing, and cannot be taken', () => {
    expect(view.tokens.find(({ id }) => id === KAEL_ID)).toMatchObject({
      silhouette: 'square',
      name: '',
      initials: '',
      art: null,
      bar: null,
      marks: [],
      moreMarks: 0,
      facingMark: false,
      onTurn: false,
      pickable: false,
      draggable: false,
    });
  });

  it('the hidden token is not drawn at all, and her own is drawn whole', () => {
    expect(view.tokens.map(({ id }) => id)).toEqual([LYRA_ID, KAEL_ID]);
    expect(view.tokens[0]).toMatchObject({ silhouette: null, name: 'Lyra' });
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
