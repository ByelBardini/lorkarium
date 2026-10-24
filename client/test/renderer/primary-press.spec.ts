import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_DRAWING_STYLE } from '@/lib/drawing-style';
import { buildBoardView, type BoardView } from '@/renderer/board-view';
import { CELL_WORLD_SIZE } from '@/renderer/camera';
import { PrimaryPress, type PressContext, type PressPoint } from '@/renderer/primary-press';
import { PressPartsFake } from '../support/press-parts-fake';
import { BIA_AT_TABLE, LYRA_ID, VHARN_SCENE, lyra } from '../support/table-session-fixtures';

const T0 = 1000;

function boardView(overrides: Partial<Parameters<typeof buildBoardView>[0]> = {}): BoardView {
  return buildBoardView({
    scene: VHARN_SCENE,
    localGridVisible: true,
    ruler: null,
    tokens: [lyra()],
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
    viewer: { userId: BIA_AT_TABLE.userId, isMaster: false },
    selectedDrawingIds: [],
    drawingPreview: [],
    drawingStyle: DEFAULT_DRAWING_STYLE,
    ...overrides,
  });
}

// The pointer over (col, row) in cells, at zoom 1 with no offset: screen = world.
function pointAt(col: number, row: number, extra: Partial<PressPoint> = {}): PressPoint {
  const world = { x: col * CELL_WORLD_SIZE, y: row * CELL_WORLD_SIZE };
  const keys = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };
  return { screen: world, world, cell: null, time: T0, ...keys, ...extra };
}

describe('PrimaryPress ping', () => {
  let parts: PressPartsFake;
  let press: PrimaryPress;
  const select: PressContext = { view: boardView(), zoom: 1 };
  const draw: PressContext = { view: boardView({ tool: 'draw', drawMode: 'draw' }), zoom: 1 };

  beforeEach(() => {
    parts = new PressPartsFake();
    press = new PrimaryPress(parts);
  });

  it('Alt + press in Desenhar pings the point in cells and starts no stroke', () => {
    press.down(draw, pointAt(5.5, 2.25, { altKey: true }));

    expect(parts.intents).toEqual([{ kind: 'pingRequested', x: 5.5, y: 2.25 }]);
    expect(parts.log).toEqual([]);
  });

  it('Alt + press in Selecionar starts no marquee, and releasing says nothing more', () => {
    press.down(select, pointAt(8.5, 8.5, { altKey: true }));
    press.up(select, pointAt(8.5, 8.5));

    expect(parts.kinds()).toEqual(['pingRequested']);
    expect(parts.log).toEqual([]);
  });

  it('Alt + press off the scene pings nothing', () => {
    press.down(select, pointAt(-1, 2, { altKey: true }));

    expect(parts.intents).toEqual([]);
  });

  it('Alt with Ctrl is not a ping: the press is the usual one', () => {
    press.down(select, pointAt(8.5, 8.5, { altKey: true, ctrlKey: true }));

    expect(parts.kinds()).toEqual(['pointerDown']);
  });

  it('Selecionar held still for 500 ms over the empty board pings and the release draws no marquee', () => {
    press.down(select, pointAt(8.5, 8.5));
    press.tick(select, T0 + 499);
    const before = parts.kinds();
    press.tick(select, T0 + 500);
    press.move(select, pointAt(9.5, 8.5));
    press.up(select, pointAt(9.5, 8.5));

    expect(before).toEqual(['pointerDown']);
    expect(parts.intents.slice(1)).toEqual([{ kind: 'pingRequested', x: 8.5, y: 8.5 }]);
    expect(parts.log).toEqual(['marquee:start', 'marquee:end']);
  });

  it('Selecionar held still for 500 ms over a token pings and the release neither picks nor drags', () => {
    press.down(select, pointAt(3.5, 4.5));
    press.tick(select, T0 + 500);
    press.up(select, pointAt(3.5, 4.5));

    expect(parts.kinds()).toEqual(['pingRequested']);
    expect(parts.log).toEqual(['token:release']);
  });

  it('moving 4 px before the 500 ms keeps the drag and never pings', () => {
    press.down(select, pointAt(3.5, 4.5));
    press.move(select, pointAt(3.5 + 4 / CELL_WORLD_SIZE, 4.5));
    press.tick(select, T0 + 900);

    expect(parts.kinds()).not.toContain('pingRequested');
    expect(parts.log).toContain(`token:drag:${LYRA_ID}`);
  });

  it('a short click on a token still picks it', () => {
    press.down(select, pointAt(3.5, 4.5));
    press.up(select, pointAt(3.5, 4.5));

    expect(parts.intents).toEqual([{ kind: 'tokenPicked', tokenId: LYRA_ID, additive: false }]);
  });

  it('Desenhar held still for 500 ms is no ping: holding is part of the stroke', () => {
    press.down(draw, pointAt(5.5, 2.5));
    press.tick(select, T0 + 900);

    expect(parts.kinds()).toEqual([]);
    expect(parts.log).toEqual(['drawing:sketch']);
  });

  it('Desenhar in its Selecionar mode held still over the empty board is no ping either', () => {
    const drawSelect = { view: boardView({ tool: 'draw', drawMode: 'select' }), zoom: 1 };

    press.down(drawSelect, pointAt(8.5, 8.5));
    press.tick(drawSelect, T0 + 900);

    expect(parts.kinds()).not.toContain('pingRequested');
    expect(parts.log).toEqual(['marquee:start']);
  });

  it('a hold already released never pings late', () => {
    press.down(select, pointAt(8.5, 8.5));
    press.up(select, pointAt(8.5, 8.5));
    press.tick(select, T0 + 900);

    expect(parts.kinds()).toEqual(['pointerDown', 'pointerUp']);
  });
});

describe('PrimaryPress with the condition tool', () => {
  let parts: PressPartsFake;
  let press: PrimaryPress;
  const conditions: PressContext = { view: boardView({ tool: 'conditions' }), zoom: 1 };

  beforeEach(() => {
    parts = new PressPartsFake();
    press = new PrimaryPress(parts);
  });

  it('a press on a token stamps the condition on it', () => {
    press.down(conditions, pointAt(3.5, 4.5));

    expect(parts.intents).toEqual([{ kind: 'conditionStamped', tokenId: LYRA_ID, removes: false }]);
  });

  it('Shift + press on a token asks to take the condition off', () => {
    press.down(conditions, pointAt(3.5, 4.5, { shiftKey: true }));

    expect(parts.intents).toEqual([{ kind: 'conditionStamped', tokenId: LYRA_ID, removes: true }]);
  });

  it('a press on the empty board stamps nothing', () => {
    press.down(conditions, pointAt(8.5, 8.5));

    expect(parts.kinds()).not.toContain('conditionStamped');
  });

  it('the stamp neither drags nor picks the token', () => {
    press.down(conditions, pointAt(3.5, 4.5));
    press.move(conditions, pointAt(5.5, 4.5));
    press.up(conditions, pointAt(5.5, 4.5));

    expect(parts.kinds()).toEqual(['conditionStamped']);
    expect(parts.log).toEqual([]);
  });
});
