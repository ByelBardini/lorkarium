import {
  CONDITION_ICONS,
  type ConditionColorDto,
  type ConditionToneDto,
} from '@lorkarium/contracts';
import { Container, Graphics, GraphicsContext, Text, Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { conditionIconSvg } from '@/lib/condition-icons';
import { PixiConditionMarks } from '@/renderer/pixi-condition-marks';
import type { ConditionMarkView } from '@/renderer/token-view';
import { TokenTexturesFake } from '../support/token-textures-fake';
import { goblinView } from '../support/token-view-fixtures';

describe('condition icons on the canvas', () => {
  it.each(CONDITION_ICONS)('PixiJS parses the %s markup into something with size', (icon) => {
    const context = new GraphicsContext().svg(conditionIconSvg(icon, '#b5654f'));
    expect(context.bounds.width).toBeGreaterThan(4);
    expect(context.bounds.height).toBeGreaterThan(4);
  });
});

describe('PixiConditionMarks stacks', () => {
  // No rounds left to write, so the only label a badge can carry is its stacks.
  const endless = (stacks: number | null): ConditionMarkView => ({
    icon: 'skull',
    tone: 'harm',
    color: null,
    remainingRounds: null,
    stacks,
    imageUrl: null,
  });
  const DETAILED_ZOOM = 2;

  function labelsOf(container: Container): Text[] {
    return container.children.flatMap((child) =>
      child instanceof Text ? [child] : labelsOf(child as Container),
    );
  }

  function drawn(stacks: number | null, zoom = DETAILED_ZOOM): PixiConditionMarks {
    const marks = new PixiConditionMarks();
    marks.draw(goblinView({ conditions: [endless(stacks)] }), zoom);
    return marks;
  }

  it('up close a stacking condition writes its stacks at the top left of the badge', () => {
    const [label] = labelsOf(drawn(3).container);
    expect(label?.text).toBe('3');
    expect(label && [label.position.x < 0, label.position.y < 0]).toEqual([true, true]);
  });

  it('up close a non-stacking condition writes no stacks', () => {
    expect(labelsOf(drawn(null).container)).toEqual([]);
  });

  it('with plain icons (zoom 1) the stacks are not written', () => {
    expect(labelsOf(drawn(3, 1).container)).toEqual([]);
  });

  it('a change of stacks alone redraws the strip with the new count', () => {
    const marks = drawn(3);
    const [before] = marks.container.children;
    marks.draw(goblinView({ conditions: [endless(4)] }), DETAILED_ZOOM);
    expect(marks.container.children[0]).not.toBe(before);
    expect(labelsOf(marks.container).map(({ text }) => text)).toEqual(['4']);
  });

  it('the same stacks drawn again keep the badges drawn', () => {
    const marks = drawn(3);
    const [before] = marks.container.children;
    marks.draw(goblinView({ conditions: [endless(3)] }), DETAILED_ZOOM);
    expect(marks.container.children[0]).toBe(before);
  });
});

describe('PixiConditionMarks image', () => {
  const URL = '/api/assets/4a3b2c1d-0e9f-4a8b-9c7d-6e5f4a3b2c1d';
  const EMBER = 0xec7a45;
  const SKY = 0x5cbcee;
  const ICONS_ZOOM = 1;
  const DOTS_ZOOM = 0.5;

  function withImage(tone: ConditionToneDto, color: ConditionColorDto): ConditionMarkView {
    return { icon: 'skull', tone, color, remainingRounds: null, stacks: null, imageUrl: URL };
  }

  function graphicsOf(container: Container): Graphics[] {
    return container.children.flatMap((child) =>
      child instanceof Graphics ? [child] : graphicsOf(child as Container),
    );
  }

  type PaintStyle = { color: number; width?: number; texture?: Texture; textureSpace?: string };

  // Every style the strip paints with, read from the contexts the way PixiJS keeps them.
  function painted(container: Container, action: 'fill' | 'stroke'): PaintStyle[] {
    return graphicsOf(container).flatMap((graphics) =>
      graphics.context.instructions
        .filter((instruction) => instruction.action === action)
        .map((instruction) => (instruction.data as { style: PaintStyle }).style),
    );
  }

  function texturedFills(container: Container): PaintStyle[] {
    return painted(container, 'fill').filter(({ texture }) => texture !== Texture.WHITE);
  }

  function drawn(mark: ConditionMarkView, zoom: number, textures: TokenTexturesFake) {
    const marks = new PixiConditionMarks(textures);
    marks.draw(goblinView({ conditions: [mark] }), zoom);
    return marks;
  }

  it('with its texture ready the badge is a circle filled by the image, ringed 1.5 in its color, without the glyph', () => {
    const textures = new TokenTexturesFake();
    const square = textures.arrive(URL);
    const { container } = drawn(withImage('harm', 'ember'), ICONS_ZOOM, textures);

    expect(texturedFills(container)).toMatchObject([{ texture: square, textureSpace: 'local' }]);
    expect(painted(container, 'stroke').map(({ color, width }) => [color, width])).toEqual([
      [EMBER, 1.5],
    ]);
  });

  it('an incapacitating condition with an image gets a ring twice as thick and no filled disc', () => {
    const textures = new TokenTexturesFake();
    textures.arrive(URL);
    const { container } = drawn(withImage('incapacitating', 'sky'), ICONS_ZOOM, textures);

    expect(painted(container, 'stroke').map(({ color, width }) => [color, width])).toEqual([
      [SKY, 3],
    ]);
    expect(painted(container, 'fill').map(({ color }) => color)).not.toContain(SKY);
  });

  it('while its texture loads the badge keeps the glyph', () => {
    const { container } = drawn(withImage('harm', 'ember'), ICONS_ZOOM, new TokenTexturesFake());

    expect(texturedFills(container)).toEqual([]);
    expect(painted(container, 'stroke').length).toBeGreaterThan(1);
  });

  it('the texture arriving redraws the same view with the image in place of the glyph', () => {
    const textures = new TokenTexturesFake();
    const marks = drawn(withImage('harm', 'ember'), ICONS_ZOOM, textures);
    const [before] = marks.container.children;
    const square = textures.arrive(URL);

    marks.draw(goblinView({ conditions: [withImage('harm', 'ember')] }), ICONS_ZOOM);

    expect(marks.container.children[0]).not.toBe(before);
    expect(texturedFills(marks.container)).toMatchObject([{ texture: square }]);
  });

  it('from afar a condition with an image is still a dot in its color', () => {
    const textures = new TokenTexturesFake();
    textures.arrive(URL);
    const { container } = drawn(withImage('harm', 'ember'), DOTS_ZOOM, textures);

    expect(texturedFills(container)).toEqual([]);
    expect(painted(container, 'fill').map(({ color }) => color)).toEqual([EMBER]);
  });
});
