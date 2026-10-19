import { beforeEach, describe, expect, it } from 'vitest';
import type { BoardIntent } from '@/renderer/board-renderer';
import { CELL_WORLD_SIZE } from '@/renderer/camera';
import { LightGestures } from '@/renderer/light-gestures';

const CELL = CELL_WORLD_SIZE;
const SCENE = { widthCells: 20, heightCells: 12 };

function world(x: number, y: number) {
  return { x: x * CELL, y: y * CELL };
}

describe('LightGestures, placing', () => {
  let intents: BoardIntent[];
  let gestures: LightGestures;

  beforeEach(() => {
    intents = [];
    gestures = new LightGestures((intent) => intents.push(intent));
  });

  function click(x: number, y: number, snap = false): void {
    const screen = { x: 100, y: 100 };
    gestures.press(SCENE, screen, world(x, y), null);
    gestures.release(screen, world(x, y), snap);
  }

  it('a click on the empty board places a light there, to the hundredth', () => {
    click(5.373, 3.124);

    expect(intents).toEqual([{ kind: 'lightPlaced', x: 5.37, y: 3.12 }]);
  });

  it('with Shift the light snaps to the half cell: (5.37, 3.12) → (5.5, 3)', () => {
    click(5.37, 3.12, true);

    expect(intents).toEqual([{ kind: 'lightPlaced', x: 5.5, y: 3 }]);
  });

  it('a click past the edge of the scene places nothing', () => {
    click(21, 3);

    expect(intents).toEqual([]);
  });

  it('a drag that starts on the empty board places nothing', () => {
    gestures.press(SCENE, { x: 100, y: 100 }, world(5, 5), null);
    gestures.move({ x: 130, y: 100 }, world(6, 5), false);
    gestures.release({ x: 130, y: 100 }, world(6, 5), false);

    expect(intents).toEqual([]);
  });

  it('the release answers that it took the pointer only when a press was held', () => {
    expect(gestures.release({ x: 0, y: 0 }, world(0, 0), false)).toBe(false);
  });
});

describe('LightGestures, the icon of a light', () => {
  const TORCH_ID = 'torch';
  let intents: BoardIntent[];
  let gestures: LightGestures;

  beforeEach(() => {
    intents = [];
    gestures = new LightGestures((intent) => intents.push(intent));
  });

  it('a click on the icon picks the light; with Shift it adds to the selection', () => {
    gestures.press(SCENE, { x: 100, y: 100 }, world(5, 5), TORCH_ID);
    gestures.release({ x: 100, y: 100 }, world(5, 5), false);
    gestures.press(SCENE, { x: 100, y: 100 }, world(5, 5), TORCH_ID);
    gestures.release({ x: 100, y: 100 }, world(5, 5), true);

    expect(intents).toEqual([
      { kind: 'lightPicked', lightId: TORCH_ID, additive: false },
      { kind: 'lightPicked', lightId: TORCH_ID, additive: true },
    ]);
  });

  it('a drag from 4 px shows where it goes and drops it there, to the hundredth', () => {
    gestures.press(SCENE, { x: 100, y: 100 }, world(5, 5), TORCH_ID);
    gestures.move({ x: 104, y: 100 }, world(6.123, 5.5), false);
    gestures.release({ x: 104, y: 100 }, world(7.256, 5.5), false);

    expect(intents).toEqual([
      { kind: 'lightMovePreviewed', lightId: TORCH_ID, point: { x: 6.12, y: 5.5 } },
      { kind: 'lightDropped', lightId: TORCH_ID, x: 7.26, y: 5.5 },
    ]);
  });

  it('with Shift the dropped light snaps to the half cell', () => {
    gestures.press(SCENE, { x: 100, y: 100 }, world(5, 5), TORCH_ID);
    gestures.move({ x: 120, y: 100 }, world(6, 5), true);
    gestures.release({ x: 120, y: 100 }, world(7.37, 3.12), true);

    expect(intents.at(-1)).toEqual({ kind: 'lightDropped', lightId: TORCH_ID, x: 7.5, y: 3 });
  });

  it('Esc while dragging puts the light back without dropping it', () => {
    gestures.press(SCENE, { x: 100, y: 100 }, world(5, 5), TORCH_ID);
    gestures.move({ x: 120, y: 100 }, world(6, 5), false);

    expect(gestures.cancel()).toBe(true);
    expect(intents.at(-1)).toEqual({ kind: 'lightMovePreviewed', lightId: TORCH_ID, point: null });
    expect(intents.map(({ kind }) => kind)).not.toContain('lightDropped');
  });
});
