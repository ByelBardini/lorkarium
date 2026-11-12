import { Container, Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { PixiTokenLayer } from '@/renderer/pixi-token-layer';
import { PixiTokenLook } from '@/renderer/pixi-token-look';
import { tokenLookStyle } from '@/renderer/token-look';
import { TokenTexturesFake } from '../support/token-textures-fake';
import { goblinView } from '../support/token-view-fixtures';

const BOX = { width: 64, height: 64, rx: 30, ry: 30, square: false };
const ART = { url: '/api/assets/goblin', frame: 'round', flipX: false, flipY: false } as const;

function filteredUnder(node: Container): number {
  const own = node.filters && [node.filters].flat().length > 0 ? 1 : 0;
  return node.children.reduce((count, child) => count + filteredUnder(child), own);
}

function faceWithParts(): Container {
  const face = new Container();
  face.addChild(new Graphics(), new Container(), new Graphics());
  return face;
}

describe('PixiTokenLook greys a token with one filter', () => {
  it('an unconscious token puts the grey filter on its face alone, none on its parts', () => {
    const face = faceWithParts();

    new PixiTokenLook().draw(
      face,
      tokenLookStyle({ looks: ['unconscious'], defeated: false }),
      BOX,
    );

    expect([face.filters].flat()).toHaveLength(1);
    expect(face.children.map(filteredUnder)).toEqual([0, 0, 0]);
  });

  it('the face fades as one: the defeated token gets alpha 0.45 on its face', () => {
    const face = faceWithParts();

    new PixiTokenLook().draw(face, tokenLookStyle({ looks: [], defeated: true }), BOX);

    expect(face.alpha).toBe(0.45);
    expect(face.children.map((part) => part.alpha)).toEqual([1, 1, 1]);
  });

  it('waking up takes the filter off the face', () => {
    const face = faceWithParts();
    const look = new PixiTokenLook();
    look.draw(face, tokenLookStyle({ looks: ['unconscious'], defeated: false }), BOX);

    look.draw(face, tokenLookStyle({ looks: [], defeated: false }), BOX);

    expect(filteredUnder(face)).toBe(0);
  });

  it('an unconscious token with its art arrived has one filter in its whole graph', () => {
    const textures = new TokenTexturesFake();
    textures.arrive(ART.url);
    const layer = new PixiTokenLayer(() => false, undefined, textures);

    layer.sync([goblinView({ art: ART, looks: ['unconscious'] })], [], 0);

    expect(filteredUnder(layer.container)).toBe(1);
  });
});
