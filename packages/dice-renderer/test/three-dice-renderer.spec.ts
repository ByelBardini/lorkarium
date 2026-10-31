import * as three from 'three';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DiceRenderer } from '../src/dice-renderer';
import { diceStageScaleOf } from '../src/dice-stage';
import { createThreeDiceRenderer } from '../src/three-dice-renderer';
import { TEST_DICE_LOOK, d20Roll, rollIdOf } from './support/dice-roll-fixtures';
import { DiceGlFake, DiceOverlayHostFake } from './support/dice-overlay-host-fake';

// The fixture's d20 settles at 2400 ms; it stays 3000 ms and fades for 600 ms.
const GONE_AFTER_MS = 2400 + 3600;

function overlayCanvas(): HTMLCanvasElement {
  const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-dice-overlay]');
  if (canvas === null) throw new Error('No dice overlay canvas in the body: expected one.');
  return canvas;
}

function rollRootsOf(scene: three.Scene | undefined): three.Object3D[] {
  return (scene?.children ?? []).filter((child) => child instanceof three.Group);
}

describe('createThreeDiceRenderer', () => {
  let host: DiceOverlayHostFake;
  let gl: DiceGlFake;
  let renderer: DiceRenderer;

  beforeEach(async () => {
    host = new DiceOverlayHostFake();
    gl = new DiceGlFake();
    renderer = await createThreeDiceRenderer({
      look: TEST_DICE_LOOK,
      view: host,
      createGl: () => gl,
    });
  });

  afterEach(() => renderer.destroy());

  it('puts one canvas over the whole window that takes no click, under the dialogs', () => {
    const { style } = overlayCanvas();

    expect(style.position).toBe('fixed');
    expect(style.inset).toBe('0px');
    expect(style.pointerEvents).toBe('none');
    expect(style.zIndex).toBe('40');
  });

  it('idle: the canvas is hidden and no frame is requested', () => {
    expect(overlayCanvas().style.display).toBe('none');
    expect(host.pendingFrames()).toBe(0);
  });

  it('a roll shows the canvas and draws on every frame while it is alive', () => {
    renderer.show(d20Roll());
    host.step(16);
    host.step(16);

    expect(overlayCanvas().style.display).toBe('block');
    expect(gl.renders).toHaveLength(2);
    expect(host.pendingFrames()).toBe(1);
  });

  it('the first frame sizes the drawing to the window', () => {
    renderer.show(d20Roll());
    host.step(16);

    expect(gl.size).toEqual({ width: 1920, height: 1080 });
    expect(gl.pixelRatio).toBe(1);
  });

  it('the roll is scaled so the roller’s box fits this window', () => {
    host.innerWidth = 1080;
    host.innerHeight = 1920;
    renderer.show(d20Roll());
    host.step(16);

    const [root] = rollRootsOf(gl.renders[0]);
    const expected = diceStageScaleOf(1.78, { width: 1080, height: 1920 });
    expect(root?.scale.x).toBeCloseTo(expected, 9);
  });

  it('once the fade is over the loop stops by itself and the canvas hides', () => {
    renderer.show(d20Roll());
    host.step(GONE_AFTER_MS - 1);
    host.step(1);

    expect(host.pendingFrames()).toBe(0);
    expect(overlayCanvas().style.display).toBe('none');
    expect(gl.renders).toHaveLength(1);
  });

  it('the same rollId twice is one roll on screen', () => {
    renderer.show(d20Roll());
    renderer.show(d20Roll());
    host.step(16);

    expect(rollRootsOf(gl.renders[0])).toHaveLength(1);
  });

  it('a roll already gone is not played again when shown again', () => {
    renderer.show(d20Roll());
    host.step(GONE_AFTER_MS);

    renderer.show(d20Roll());

    expect(host.pendingFrames()).toBe(0);
  });

  it('clear drops every roll at once and stops the loop; a new roll still plays', () => {
    renderer.show(d20Roll());
    renderer.show(d20Roll(rollIdOf(1)));

    renderer.clear();
    expect(host.pendingFrames()).toBe(0);
    expect(overlayCanvas().style.display).toBe('none');

    renderer.show(d20Roll(rollIdOf(2)));
    host.step(16);
    expect(rollRootsOf(gl.renders[0])).toHaveLength(1);
  });

  it('destroy removes the canvas and frees the GPU', () => {
    renderer.show(d20Roll());

    renderer.destroy();

    expect(document.querySelector('canvas[data-dice-overlay]')).toBeNull();
    expect(gl.disposed).toBe(true);
    expect(host.pendingFrames()).toBe(0);
  });
});

describe('createThreeDiceRenderer inside a container', () => {
  let host: DiceOverlayHostFake;
  let gl: DiceGlFake;
  let stage: HTMLElement;
  let renderer: DiceRenderer;

  beforeEach(async () => {
    host = new DiceOverlayHostFake();
    gl = new DiceGlFake();
    stage = document.createElement('div');
    Object.defineProperty(stage, 'clientWidth', { value: 800 });
    Object.defineProperty(stage, 'clientHeight', { value: 500 });
    document.body.append(stage);
    renderer = await createThreeDiceRenderer({
      look: TEST_DICE_LOOK,
      view: host,
      createGl: () => gl,
      container: stage,
    });
  });

  afterEach(() => {
    renderer.destroy();
    stage.remove();
  });

  it('puts the canvas inside the container, covering it, instead of over the window', () => {
    const canvas = stage.querySelector<HTMLCanvasElement>('canvas[data-dice-overlay]');

    expect(canvas?.style.position).toBe('absolute');
    expect(canvas?.style.inset).toBe('0px');
    expect(document.body.querySelectorAll(':scope > canvas[data-dice-overlay]')).toHaveLength(0);
  });

  it('sizes the drawing to the container, not to the window', () => {
    renderer.show(d20Roll());
    host.step(16);

    expect(gl.size).toEqual({ width: 800, height: 500 });
  });

  it('a zoom of 2 draws the roll twice as large, centred on the box', async () => {
    renderer.destroy();
    renderer = await createThreeDiceRenderer({
      look: TEST_DICE_LOOK,
      view: host,
      createGl: () => gl,
      container: stage,
      zoom: 2,
    });
    renderer.show(d20Roll());
    host.step(16);

    const [root] = rollRootsOf(gl.renders.at(-1));
    expect(root?.scale.x).toBeCloseTo(diceStageScaleOf(1.78, { width: 800, height: 500 }) * 2, 9);
  });

  it.each([0, -1, Number.NaN])('refuses a zoom of %s naming the shape expected', async (zoom) => {
    await expect(
      createThreeDiceRenderer({ look: TEST_DICE_LOOK, view: host, createGl: () => gl, zoom }),
    ).rejects.toThrow(/zoom.*positive/);
  });

  it('takes the canvas out of the container on destroy', () => {
    renderer.destroy();

    expect(stage.querySelector('canvas')).toBeNull();
  });
});
