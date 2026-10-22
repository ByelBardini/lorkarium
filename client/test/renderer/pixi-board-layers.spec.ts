import { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { PixiDrawingLayer } from '@/renderer/pixi-drawing-layer';
import { PixiEffectAreaLayer } from '@/renderer/pixi-effect-area-layer';
import { PixiTokenLayer } from '@/renderer/pixi-token-layer';
import type { TokenView } from '@/renderer/token-view';

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
    const [background, , objects, , tokensLayer] = tokens.container.children as Container[];

    expect(tokensLayer?.children[0]).toBe(beneath);
    expect(background?.children).not.toContain(beneath);
    expect(objects?.children).not.toContain(beneath);
  });

  it('a token’s condition strip and name go in the strips of its layer, right above its tokens and under the next layer', () => {
    const { tokens } = stack();
    const poisoned = { icon: 'skull', tone: 'harm', remainingRounds: 2 } as const;
    tokens.sync([chestOnObjects([poisoned])], [], 0);
    const [, backgroundStrips, objects, objectStrips, tokensLayer] = tokens.container
      .children as Container[];

    expect(objects?.children).toHaveLength(1);
    expect(objectStrips?.children).toHaveLength(1);
    const [strip, nameTag] = objectStrips?.children[0]?.children ?? [];
    expect(strip?.children.length).toBeGreaterThan(0);
    expect(nameTag).toBeDefined();
    expect(backgroundStrips?.children).toEqual([]);
    expect(tokens.container.getChildIndex(objectStrips!)).toBeLessThan(
      tokens.container.getChildIndex(tokensLayer!),
    );
  });
});

function chestOnObjects(conditions: TokenView['conditions']): TokenView {
  return {
    id: 'chest',
    name: 'Baú',
    initials: 'BA',
    ring: 'neutral',
    col: 0,
    row: 0,
    width: 1,
    height: 1,
    bar: null,
    layer: 'objects',
    pickable: false,
    selected: false,
    draggable: false,
    onTurn: false,
    conditions,
    looks: [],
    art: null,
    facing: 0,
    facingMark: false,
    defeated: false,
    silhouette: null,
  };
}
