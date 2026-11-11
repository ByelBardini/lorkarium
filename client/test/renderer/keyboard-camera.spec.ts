import { describe, expect, it } from 'vitest';
import { KeyboardCamera, type KeyboardCameraMoves } from '@/renderer/keyboard-camera';

/** What the keys asked of the camera, in order. */
class CameraMovesFake implements KeyboardCameraMoves {
  readonly asked: string[] = [];
  gestureUnderWay = false;

  cancel = (): boolean => {
    this.asked.push('cancel');
    return this.gestureUnderWay;
  };

  zoomBy = (factor: number): void => void this.asked.push(`zoom ${factor}`);

  fitScene = (): void => void this.asked.push('fit');

  panBy = (dx: number, dy: number): void => void this.asked.push(`pan ${dx} ${dy}`);
}

function key(
  name: string,
  modifiers: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey', boolean>> = {},
) {
  return { key: name, ctrlKey: false, metaKey: false, altKey: false, ...modifiers };
}

function cameraWith() {
  const moves = new CameraMovesFake();
  return { moves, keys: new KeyboardCamera(moves) };
}

describe('KeyboardCamera', () => {
  it('W held pans up at 600 px/s on each tick, and stops once let go', () => {
    const { moves, keys } = cameraWith();

    keys.down(key('w'));
    keys.tick(500);
    keys.up(key('w'));
    keys.tick(500);

    expect(moves.asked).toEqual(['pan 0 300']);
  });

  it('the host losing the focus lets go of every held key', () => {
    const { moves, keys } = cameraWith();
    keys.down(key('d'));

    keys.release();
    keys.tick(500);

    expect(moves.asked).toEqual([]);
  });

  it('+ zooms in by 1.25, - out by the inverse, 0 frames the scene', () => {
    const { moves, keys } = cameraWith();

    for (const name of ['+', '-', '0']) keys.down(key(name));

    expect(moves.asked).toEqual(['zoom 1.25', 'zoom 0.8', 'fit']);
  });

  it('with Ctrl a W is the browser’s: nothing pans', () => {
    const { moves, keys } = cameraWith();

    keys.down(key('w', { ctrlKey: true }));
    keys.tick(500);

    expect(moves.asked).toEqual([]);
  });

  it('Esc taken by a gesture under way does nothing more', () => {
    const { moves, keys } = cameraWith();
    moves.gestureUnderWay = true;

    keys.down(key('Escape'));

    expect(moves.asked).toEqual(['cancel']);
  });
});
