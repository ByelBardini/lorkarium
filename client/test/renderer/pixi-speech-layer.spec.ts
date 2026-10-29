import { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { PixiSpeechLayer } from '@/renderer/pixi-speech-layer';
import type { SpeechBalloon } from '@/renderer/speech-balloon';
import { goblinView } from '../support/token-view-fixtures';

const SCENE = 'scene-1';
const FRAME = { camera: { offsetX: 0, offsetY: 0, zoom: 1 } };

/** The bubbles the layer asked for, as "name: text"; each is an empty container (jsdom
 *  measures no text). */
class SpeechBubbleFake {
  readonly made: string[] = [];

  readonly make = (speakerName: string, text: string): Container => {
    this.made.push(`${speakerName}: ${text}`);
    return new Container();
  };
}

/** The wall clock the layer reads, moved by hand. */
class SpeechClockFake {
  nowMs = 1000;
  reads = 0;

  readonly now = (): number => {
    this.reads += 1;
    return this.nowMs;
  };
}

function balloon(overrides: Partial<SpeechBalloon> = {}): SpeechBalloon {
  return {
    id: 'm1',
    sceneId: SCENE,
    tokenId: 'goblin',
    speakerName: 'Goblin',
    text: 'Quem vem lá?',
    shownAt: 1000,
    ...overrides,
  };
}

function layerWith() {
  const clock = new SpeechClockFake();
  const bubbles = new SpeechBubbleFake();
  const layer = new PixiSpeechLayer(clock.now, bubbles.make);
  layer.syncTokens([goblinView({ col: 2, row: 3 })]);
  return { layer, clock, bubbles };
}

describe('PixiSpeechLayer', () => {
  it('with no balloon, animate touches nothing and asks for no render', () => {
    const { layer, clock, bubbles } = layerWith();

    expect([layer.animate(FRAME), layer.animate(FRAME)]).toEqual([false, false]);
    expect(clock.reads).toBe(0);
    expect(bubbles.made).toEqual([]);
  });

  it('a balloon handed over shows over its token, at the anchor in screen px, and asks for a render', () => {
    const { layer, bubbles } = layerWith();
    layer.showSpeech(SCENE, [balloon()]);

    const rendered = layer.animate(FRAME);

    expect(rendered).toBe(true);
    expect(bubbles.made).toEqual(['Goblin: Quem vem lá?']);
    const [bubble] = layer.container.children;
    expect([bubble?.position.x, bubble?.position.y]).toEqual([160, 184]);
  });

  it('a still balloon with a still camera asks for no render on the next frames', () => {
    const { layer, bubbles } = layerWith();
    layer.showSpeech(SCENE, [balloon()]);
    layer.animate(FRAME);

    expect(layer.animate(FRAME)).toBe(false);
    expect(bubbles.made).toEqual(['Goblin: Quem vem lá?']);
  });

  it('the camera moving moves the balloon with it, without building it again', () => {
    const { layer, bubbles } = layerWith();
    layer.showSpeech(SCENE, [balloon()]);
    layer.animate(FRAME);

    const rendered = layer.animate({ camera: { offsetX: 40, offsetY: 0, zoom: 1 } });

    expect(rendered).toBe(true);
    expect(layer.container.children[0]?.position.x).toBe(200);
    expect(bubbles.made).toHaveLength(1);
  });

  it('the token walking to a new cell takes its balloon along', () => {
    const { layer } = layerWith();
    layer.showSpeech(SCENE, [balloon()]);
    layer.animate(FRAME);

    layer.syncTokens([goblinView({ col: 5, row: 3 })]);
    layer.animate(FRAME);

    expect(layer.container.children[0]?.position.x).toBe(5 * 64 + 32);
  });

  it('4.5 s later the balloon is gone, the layer is empty and asks for one last render', () => {
    const { layer, clock } = layerWith();
    layer.showSpeech(SCENE, [balloon({ shownAt: 1000 })]);
    layer.animate(FRAME);

    clock.nowMs = 5500;
    const rendered = layer.animate(FRAME);

    expect(rendered).toBe(true);
    expect([layer.shownCount(), layer.container.children.length]).toEqual([0, 0]);
    expect(layer.animate(FRAME)).toBe(false);
  });

  it('a newer line of the same token replaces the bubble on screen', () => {
    const { layer, bubbles } = layerWith();
    layer.showSpeech(SCENE, [balloon()]);
    layer.animate(FRAME);

    layer.showSpeech(SCENE, [balloon(), balloon({ id: 'm2', text: 'Corram!', shownAt: 1200 })]);
    layer.animate(FRAME);

    expect(bubbles.made).toEqual(['Goblin: Quem vem lá?', 'Goblin: Corram!']);
    expect(layer.container.children).toHaveLength(1);
  });

  it('the token leaving the view (hidden by vision) takes its balloon off', () => {
    const { layer } = layerWith();
    layer.showSpeech(SCENE, [balloon()]);
    layer.animate(FRAME);

    layer.syncTokens([]);
    layer.animate(FRAME);

    expect(layer.shownCount()).toBe(0);
  });

  it('a token that comes into view before the 4.5 s end shows the balloon still alive', () => {
    const { layer, clock } = layerWith();
    layer.syncTokens([]);
    layer.showSpeech(SCENE, [balloon({ shownAt: 1000 })]);
    layer.animate(FRAME);

    clock.nowMs = 3000;
    layer.syncTokens([goblinView()]);
    layer.animate(FRAME);

    expect(layer.shownCount()).toBe(1);
  });
});
