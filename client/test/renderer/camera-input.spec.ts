import { describe, expect, it } from 'vitest';
import {
  KEYBOARD_PAN_SPEED,
  blocksBrowserMenu,
  cameraKeyAction,
  endRightDrag,
  keyboardPan,
  moveRightDrag,
  panKeyOf,
  startRightDrag,
  wheelIntent,
  type WheelInput,
} from '@/renderer/camera-input';

function wheel(overrides: Partial<WheelInput>): WheelInput {
  return {
    deltaX: 0,
    deltaY: 0,
    deltaMode: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    x: 300,
    y: 200,
    ...overrides,
  };
}

describe('wheelIntent', () => {
  it('a plain wheel pans the board against the scroll', () => {
    expect(wheelIntent(wheel({ deltaX: 10, deltaY: 30 }))).toEqual({
      kind: 'pan',
      dx: -10,
      dy: -30,
    });
  });

  it('Shift + a vertical wheel pans horizontally', () => {
    expect(wheelIntent(wheel({ deltaY: 30, shiftKey: true }))).toEqual({
      kind: 'pan',
      dx: -30,
      dy: 0,
    });
  });

  it.each(['ctrlKey', 'metaKey'] as const)('%s + wheel zooms at the cursor', (modifier) => {
    const intent = wheelIntent(wheel({ deltaY: -100, [modifier]: true }));
    expect(intent).toMatchObject({ kind: 'zoom', at: { x: 300, y: 200 } });
    if (intent.kind !== 'zoom') throw new Error('expected a zoom');
    expect(intent.factor).toBeGreaterThan(1);
  });

  it('scrolling down with Ctrl zooms out', () => {
    const intent = wheelIntent(wheel({ deltaY: 100, ctrlKey: true }));
    if (intent.kind !== 'zoom') throw new Error('expected a zoom');
    expect(intent.factor).toBeLessThan(1);
  });

  it('a wheel in lines (deltaMode 1) counts 16 px per line', () => {
    expect(wheelIntent(wheel({ deltaY: 3, deltaMode: 1 }))).toEqual({
      kind: 'pan',
      dx: -0,
      dy: -48,
    });
  });
});

describe('keyboard pan', () => {
  it.each([
    ['w', 'w'],
    ['W', 'w'],
    ['d', 'd'],
    ['q', null],
  ])('%s is pan key %s', (key, pan) => {
    expect(panKeyOf(key)).toBe(pan);
  });

  it('W held for 100 ms moves the view 60 px up (the board comes down)', () => {
    expect(KEYBOARD_PAN_SPEED).toBe(600);
    expect(keyboardPan(new Set(['w']), 100)).toEqual({ dx: 0, dy: 60 });
  });

  it('D held moves the view right (the board goes left)', () => {
    expect(keyboardPan(new Set(['d']), 100)).toEqual({ dx: -60, dy: 0 });
  });

  it('W and D together move diagonally at the same speed, not faster', () => {
    const { dx, dy } = keyboardPan(new Set(['w', 'd']), 100);
    expect(Math.hypot(dx, dy)).toBeCloseTo(60);
    expect(dx).toBeCloseTo(-dy);
  });

  it('W and S together cancel out', () => {
    expect(keyboardPan(new Set(['w', 's']), 100)).toEqual({ dx: 0, dy: 0 });
  });
});

describe('cameraKeyAction', () => {
  it.each([
    ['+', 'zoom-in'],
    ['=', 'zoom-in'],
    ['-', 'zoom-out'],
    ['0', 'fit'],
    ['x', null],
  ])('%s → %s', (key, action) => {
    expect(cameraKeyAction({ key, ctrlKey: false, metaKey: false, altKey: false })).toBe(action);
  });

  it.each(['ctrlKey', 'metaKey', 'altKey'] as const)(
    '%s + "+" is the browser zoom, not ours',
    (modifier) => {
      const press = { key: '+', ctrlKey: false, metaKey: false, altKey: false, [modifier]: true };
      expect(cameraKeyAction(press)).toBeNull();
    },
  );
});

describe('right drag', () => {
  it('a right button that moves less than 4 px is a context click', () => {
    const drag = moveRightDrag(startRightDrag({ x: 10, y: 10 }), { x: 12, y: 12 }).drag;
    expect(endRightDrag(drag)).toBe('context');
  });

  it('from 4 px on it pans by each move, and ending it is not a context click', () => {
    const started = startRightDrag({ x: 10, y: 10 });
    const first = moveRightDrag(started, { x: 14, y: 10 });
    expect(first.pan).toEqual({ dx: 4, dy: 0 });
    const second = moveRightDrag(first.drag, { x: 20, y: 7 });
    expect(second.pan).toEqual({ dx: 6, dy: -3 });
    expect(endRightDrag(second.drag)).toBe('pan-end');
  });

  it('under 4 px nothing pans yet', () => {
    expect(moveRightDrag(startRightDrag({ x: 0, y: 0 }), { x: 2, y: 2 }).pan).toBeNull();
  });
});

describe('blocksBrowserMenu', () => {
  const board = { left: 100, top: 50, right: 900, bottom: 650 };

  it('holds back the browser menu on a click inside the board, even when it lands on the page under a modal menu', () => {
    expect(blocksBrowserMenu({ x: 400, y: 300, editable: false }, board)).toBe(true);
    expect(blocksBrowserMenu({ x: 100, y: 650, editable: false }, board)).toBe(true);
  });

  it('lets the browser menu open outside the board', () => {
    expect(blocksBrowserMenu({ x: 99, y: 300, editable: false }, board)).toBe(false);
    expect(blocksBrowserMenu({ x: 400, y: 651, editable: false }, board)).toBe(false);
  });

  it('lets the browser menu open on a text field over the board (paste, spelling)', () => {
    expect(blocksBrowserMenu({ x: 400, y: 300, editable: true }, board)).toBe(false);
  });
});
