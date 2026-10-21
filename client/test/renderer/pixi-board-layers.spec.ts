import { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { PixiDrawingLayer } from '@/renderer/pixi-drawing-layer';
import { PixiEffectAreaLayer } from '@/renderer/pixi-effect-area-layer';
import { PixiTokenLayer } from '@/renderer/pixi-token-layer';

// The order of the containers is the order on screen: a later child is drawn over an earlier one.
describe('the layers of the board, bottom to top', () => {
  function stack() {
    const drawings = new PixiDrawingLayer();
    const areas = new PixiEffectAreaLayer();
    const beneath = areas.under(drawings.layer);
    const tokens = new PixiTokenLayer(() => true, beneath);
    return { drawings, areas, beneath, tokens };
  }

  it('the drawings go over the areas of effect, both in one container', () => {
    const { drawings, areas, beneath } = stack();

    expect(beneath.children).toEqual([areas.container, drawings.layer]);
  });

  it('that container sits in the Tokens layer, the last of the three, under its tokens', () => {
    const { beneath, tokens } = stack();
    const [background, objects, tokensLayer] = tokens.container.children as Container[];

    expect(tokensLayer?.children[0]).toBe(beneath);
    expect(background?.children).not.toContain(beneath);
    expect(objects?.children).not.toContain(beneath);
  });
});
