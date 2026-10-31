import * as three from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ThreeDiceRenderer,
  createThreeDiceRenderer,
  playDiceThrow,
  type DiceRenderer,
} from '../src/index';
import { D20_ROLL_ID, TEST_DICE_LOOK, d20Roll } from './support/dice-roll-fixtures';
import { DiceGlFake, DiceOverlayHostFake } from './support/dice-overlay-host-fake';

function overlayCanvas(): HTMLCanvasElement | null {
  return document.querySelector<HTMLCanvasElement>('canvas[data-dice-overlay]');
}

describe('@lorkarium/dice-renderer entry', () => {
  let renderer: DiceRenderer | null = null;

  afterEach(() => {
    renderer?.destroy();
    renderer = null;
  });

  it('ThreeDiceRenderer built over three.js plays a roll on its own overlay canvas', () => {
    const host = new DiceOverlayHostFake();
    const gl = new DiceGlFake();
    renderer = new ThreeDiceRenderer(three, {
      look: TEST_DICE_LOOK,
      view: host,
      createGl: () => gl,
    });

    renderer.show(d20Roll());
    host.step(16);

    expect(overlayCanvas()?.style.display).toBe('block');
    expect(gl.renders).toHaveLength(1);
  });

  it('createThreeDiceRenderer loads three.js and hands back a DiceRenderer', async () => {
    const host = new DiceOverlayHostFake();
    const gl = new DiceGlFake();
    renderer = await createThreeDiceRenderer({
      look: TEST_DICE_LOOK,
      view: host,
      createGl: () => gl,
    });

    renderer.show(d20Roll());
    host.step(16);

    expect(gl.renders).toHaveLength(1);
  });

  it('playDiceThrow pins the throw to the local clock and settles with its last die', () => {
    const played = playDiceThrow(D20_ROLL_ID, d20Roll().throw, 1000);

    expect(played.startedAtMs).toBe(1000);
    expect(played.settleMs).toBe(2400);
  });

  it('a profile color missing from look.colorHex is refused citing the color, the kind and the shape', () => {
    renderer = new ThreeDiceRenderer(three, {
      look: { ...TEST_DICE_LOOK, colorHex: { ember: 0xe0704f } },
      view: new DiceOverlayHostFake(),
      createGl: () => new DiceGlFake(),
    });

    const showing = (): void => renderer?.show(d20Roll());

    expect(showing).toThrow(RangeError);
    expect(showing).toThrow(/"rose".*d20.*colorHex\.rose = 0xrrggbb/);
  });
});
